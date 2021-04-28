// first we import a few needed things again
import {
	PuppetBridge,
	IRemoteUser,
	IReceiveParams,
	IRemoteRoom,
	IMessageEvent,
	IFileEvent,
	Log,
	IRetList,
	IPresenceEvent,
	MatrixPresence,
} from "mx-puppet-bridge";
import { HadesClient, HadesMessage } from "./hades-client";
import axios from 'axios'
var he = require('he');

// here we create our log instance
const log = new Log("HadesPuppet:hades");

// this interface is to hold all data on a single puppet
interface IHadesPuppet {
	// this is usually a client class that connects to the remote protocol
	// as we just echo back, unneeded in our case
	client: HadesClient;
	data: any; // and let's keep a copy of the data associated with a puppet
}

// we can hold multiple puppets at once...
interface IHadesPuppets {
	[puppetId: number]: IHadesPuppet;
}

export class Hades {
	private puppets: IHadesPuppets = {};
	constructor(
		private puppet: PuppetBridge,
	) { }

	private showSystemMessages: boolean = false;
	private displayNames: Array<string> = [];

	//
	// generate parameters for Matrix to map user / room
	public getSendParams(puppetId: number, msg: HadesMessage): IReceiveParams {
		
		// for rooms and users, ids are local to current Matrix Puppet - so no need to be globally unique
		const userId: string = msg.user.toLocaleLowerCase();

		// Try to handle changes in case of Username (Damn you hades)

		// If we don't have one recorded, record the current one
		if(this.displayNames[userId] == undefined) {
			this.displayNames[userId] = msg.user;
			console.log("Setting user name to " + msg.user);
		} else if(this.displayNames[userId].toLocaleLowerCase() != userId && 
			   this.displayNames[userId] != msg.user) {
			// If we have one, but the new one is not all lowercase then update it
			this.displayNames[userId] = msg.user;
			console.log("Changing User name to " + msg.user);
		}

		return {
			room: {
				// if it's a private message, use a room of the users name, otherwise main "hades" room
				roomId: msg.private ? msg.user : "hades" ,
				name: msg.private ? msg.user + " (Hades)" : "Hades",
				isDirect: msg.private,
				puppetId: puppetId
			},
			user: {
				// For userId to lowercase, can leave display name as how Hades capatalises it
				userId: userId,	
				name: this.displayNames[userId],
				puppetId, 
			},
		};
	}

	public async newPuppet(puppetId: number, data: any) {
		// this is called when we need to create a new puppet
		// the puppetId is the ID associated with that puppet and the data its data
		if (this.puppets[puppetId]) {
			// the puppet somehow already exists, delete it first
			await this.deletePuppet(puppetId);
		}
		// usually we create a client class of some sorts to the remote protocol
		// and listen to incoming messages from it
		const client = new HadesClient(data);
//		client.on("message", this.handleRemoteMessage.bind(this));
		this.puppets[puppetId] = {
			client,
			data,
		};
		await client.connect();

		client.on("connected", async () => {
			await this.puppet.sendStatusMessage(puppetId, "connected");

			// Update Users
			const reply: IRetList[] = [];
			for (const user of client.GetUsers()) {
				await this.puppet.updateUser({
					userId: user, 
					puppetId: puppetId
				});
			}

		});

		client.on("message", async (msg: HadesMessage) => {
			try {
				log.info("Got new message event", msg);
				await this.handleHadesMessage(puppetId, msg);
			} catch (err) {
				log.error("Error handling hades message event", err);
			}
		});

	}

	public async deletePuppet(puppetId: number) {
		// this is called when we need to delete a puppet
		const p = this.puppets[puppetId];
		if (!p) {
			// puppet doesn't exist, nothing to do
			return;
		}
		// usually we'd need to stop the client to the remote protocol here
		// await p.client.stop();
		delete this.puppets[puppetId]; // and finally delete our local copy
	}

    private delay(ms: number) {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }

	public async handleMatrixMessage(room: IRemoteRoom, data: IMessageEvent, event: any) {
		// this is called every time we receive a message from matrix and need to
		// forward it to the remote protocol.

		// first we check if the puppet exists
		const p = this.puppets[room.puppetId];
		if (!p) {
			return;
		}
		// usually you'd send it here to the remote protocol via the client object
		
		console.log("sending message to Room ", room.roomId);
		console.log("message ", data);

		let directed = false;
		let message = data.body;

		// Check for Directed Message
		if(data.formattedBody?.startsWith("<a href=\"https://matrix.to")) {
			directed = true;
			message = message.replace("(Away):", "");		// Handle users that are AFK
			message = message.replace(":", "");
		}

		if(room.roomId == "hades") {

			if(data.emote) {
				p.client.send((directed ? ".emoteto " : ".emote ") + message);
				return;
			}

			if(message.startsWith('/')) {
				p.client.send(message.replace(/^\/+/,"."));
				this.showSystemMessages = true;
				this.delay(20000).then(()=>{
					this.showSystemMessages = false;
				});
				return;
			}


			p.client.send((directed ? ".sayto " : ".say ") + message);

		} else {
			// It's a private item
			if(data.emote) {
				p.client.send(`.temote ${room.roomId} ` + message);
				return;
			}

			p.client.send(`.tell ${room.roomId} ` + message);
		}



	}

	//
	// called every time we receive a file from matrix, as we enabled said feature
	public async handleMatrixFile(room: IRemoteRoom, data: IFileEvent, event: any) {

		// first we check if the puppet exists
		const p = this.puppets[room.puppetId];
		if (!p) { return; }

		// just say the URL on hades
		p.client.send(`.say ` + data.url);
	}

	//
	// Create new room
	public async createRoom(room: IRemoteRoom): Promise<IRemoteRoom | null> {
		// first we check if the puppet exists
		const p = this.puppets[room.puppetId];
		if (!p) {
			return null;
		}
		
		log.info(`Received create request for channel update puppetId=${room.puppetId} roomId=${room.roomId}`);

		//
		// given our protocol, should only ever receive requests to create direct message
		// rooms.  But will check just in case
		if(room.roomId != "hades") {
			// for DM rooms, stick "(Hades)" after the name for clarity
			return {
				puppetId: room.puppetId,
				roomId: room.roomId.toLocaleLowerCase(),
				name: room.roomId + " (Hades)",
				isDirect: true,
			};
		} else {
			return {
				puppetId: room.puppetId,
				roomId: room.roomId,
				name: "Hades",
				isDirect: false,
			};
		}
	}

	//
	// called when someone invites a ghost on the matrix side
	public async getDmRoomId(user: IRemoteUser): Promise<string | null> {
		// first we check if the puppet exists
		const p = this.puppets[user.puppetId];
		if (!p) {
			return null;
		}

		// dm room names are just the userid
		return user.userId.toLocaleLowerCase();
	}
	
	public async handleHadesMessage(puppetId: number, msg: HadesMessage) {

		if (msg == null  || (msg.ignore && !this.showSystemMessages)) {
			return; // nothing to do
		}

		const params = await this.getSendParams(puppetId, msg);

		// Ignore own actions
		if((msg.action == "says" || msg.action == "emote") && msg.user == "You") {
			return;
		}

		// AFK changes
		if(msg.action == "returns" || msg.action == "away") {

			// Currently looping when set to "online"
			const user: IRemoteUser = {
				userId: msg["user"].toLocaleLowerCase(), 
				name: msg.user + (msg.action == "away" ? " (Away)" : ""),
				puppetId
			};
			
			await this.puppet.updateUser(user)
			await this.puppet.setUserStatus(user, msg.action == "away" ? "away" : "online");

			return;
		}

		if(msg.sysMessage || msg.action == "sysMessage") {
			if(!this.showSystemMessages) {			
				return;
			}

			const opts = {
				body: "```\n" + msg.text + "\n```",
				formattedBody: "<pre>" + he.encode(msg.text) + "</pre>",
				emote: false,
			};
			await this.puppet.sendMessage(params, opts);

			return;
		}

		// Mark user as Online
		const user: IRemoteUser = {
			userId : msg["user"].toLocaleLowerCase(), 
			puppetId,
		}
		this.puppet.setUserPresence(user, "online");

		
		if(msg.action == "url") {
			
			// Perform http head request to see if it's an image
			const url = msg.text.trim();
			await axios.get(url)
				.then(data => { 
					if(data.headers['content-type'] !== undefined && data.headers['content-type'].startsWith("image"))
					{
						this.puppet.sendFileDetect(params, msg.text);
					}
				})
				.catch(err => { console.log(err); });
		}

		// Look for mentions and add in "proper" name for notifications
		const p = this.puppets[puppetId];
		if(p != null && p.data["matrixName"] != null && p.data["matrixName"].length > 0) {
			msg.text = msg.text.replace(new RegExp("(\\b" + p.data["username"] + "\\b)", "gi"), "$& (" + p.data["matrixName"] + ")");
		}

		if(msg.directedTarget == "@YOU") {
			msg.directedTarget = p.data["matrixName"];
		}

		const opts = {
			body: (msg.directed ? `@${msg.directedTarget}: ` : "" ) + msg.text,
			formattedBody: (msg.directed ? `@${msg.directedTarget}: ` : "" ) + he.encode(msg.text),
			emote: msg.emote,
		};
		await this.puppet.sendMessage(params, opts);
	}

	public async listUsers(puppetId: number): Promise<IRetList[]> {
		const p = this.puppets[puppetId];
		const client = this.puppets[puppetId].client;

		if (!p) {
			return [];
		}
		const reply: IRetList[] = [];
		for (const user of client.GetUsers()) {
			reply.push({
				id: user,
				name: user,
			});
		}
		return reply;
	}
}