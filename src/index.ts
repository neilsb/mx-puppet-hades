// first we import needed stuffs
import {
	PuppetBridge,
	IPuppetBridgeRegOpts,
	Log,
	IRetData,
	Util,
	IProtocolInformation,
} from "mx-puppet-bridge";
import * as commandLineArgs from "command-line-args";
import * as commandLineUsage from "command-line-usage";
import { Hades } from "./hades";

// here we create the log instance using the bridges logging
const log = new Log("HadesPuppet:index");

// we want to handle command line options for registration etc.
const commandOptions = [
	{ name: "register", alias: "r", type: Boolean },
	{ name: "registration-file", alias: "f", type: String },
	{ name: "config", alias: "c", type: String },
	{ name: "help", alias: "h", type: Boolean },
];
const options = Object.assign({
	"register": false,
	"registration-file": "hades-registration.yaml",
	"config": "config.yaml",
	"help": false,
}, commandLineArgs(commandOptions));

// if we asked for help, just display the help and exit
if (options.help) {
	// tslint:disable-next-line:no-console
	console.log(commandLineUsage([
		{
			header: "Matrix My Protocl Puppet Bridge",
			content: "A matrix puppet bridge for my protocol",
		},
		{
			header: "Options",
			optionList: commandOptions,
		},
	]));
	process.exit(0);
}

// here we define some information about our protocol, what features it supports etc.
const protocol: IProtocolInformation = {
	features: {
		file: true, // we support receiving files
		presence: true, // we support presence
	},
	id: "hades", // an internal ID for the protocol, all lowercase
	displayname: "Hades", // a human-readable name of the protocol
	externalUrl: "https://github.com/Sorunome/mx-puppet-echo", // A URL about your protocol
};

// next we create the puppet class.
const puppet = new PuppetBridge(options["registration-file"], options.config, protocol);

// check if the options were to register
if (options.register) {
	// okay, all we have to do is generate a registration file
	puppet.readConfig(false);
	try {
		puppet.generateRegistration({
			prefix: "_hadespuppet_",
			id: "hades-puppet",
			url: `http://${puppet.Config.bridge.bindAddress}:${puppet.Config.bridge.port}`,
		});
	} catch (err) {
		// tslint:disable-next-line:no-console
		console.log("Couldn't generate registration file:", err);
	}
	process.exit(0);
}

// this is where we initialize and start the puppet
async function run() {
	await puppet.init(); // always needed, initialize the puppet

	// create our own protocol class
	const hades = new Hades(puppet);

	// required: listen to when a new puppet is created
	puppet.on("puppetNew", hades.newPuppet.bind(hades));
	// required: listen to when a puppet is deleted
	puppet.on("puppetDelete", hades.deletePuppet.bind(hades));
	// required: listen to when a message is received from matrix
	puppet.on("message", hades.handleMatrixMessage.bind(hades));
	// optional (since we enabled it in features): listen to files received from matrix
	puppet.on("file", hades.handleMatrixFile.bind(hades));
	// optional: create room hook (needed for initiating DMs on matrix)
	puppet.setCreateRoomHook(hades.createRoom.bind(hades));
	// optional: get DM room ID hook (needed for initiating DMs on matrix)
	puppet.setGetDmRoomIdHook(hades.getDmRoomId.bind(hades));
	// required: get description hook
	puppet.setGetDescHook(async (puppetId: number, data: any): Promise<string> => {
		// here we receive the puppet ID and the data associated with that puppet
		// we are expected to return a displayable name for that particular puppet
		return `Hades puppet ${data.name}`;
	});

	// required: get data from string hook
	puppet.setGetDataFromStrHook(async (str: string): Promise<IRetData> => {
		const retData: IRetData = {
			success: false,
		};
		if (!str || str === "invalid") {
			retData.error = "Link a Hades account with `link <username> <password> [matrix name]`";
			return retData;
		}

		const parts = str.trim().split(" ");
		const INDEX_USERNAME = 0;
		const INDEX_PASSWORD = 1;
		const INDEX_MATRIXNAME = 2;
		if (parts.length !== 2 && parts.length !== 3) {
			retData.error = "Link a Hades account with `link <username> <password> [matrix name]`";
			return retData;
		}

		// optional notificaiton name replacement
		if(parts.length == 2) {
			parts[INDEX_MATRIXNAME] = ""
		}

		retData.success = true;
		retData.data = {
			username: parts[INDEX_USERNAME],
			password: parts[INDEX_PASSWORD],
			matrixName: parts[INDEX_MATRIXNAME]
		};

		return retData;
	});

	// required: default display name of the bridge bot. TODO: change/remove
	puppet.setBotHeaderMsgHook((): string => {
		return "Hades Puppet Bridge";
	});

	puppet.setListUsersHook(hades.listUsers.bind(hades));


	// and finally, we start the puppet
	await puppet.start();
}

// tslint:disable-next-line:no-floating-promises
run();
