import {Event} from "typescript.events";
import { stringify } from "querystring";
const net = require('net');
const stripAnsi = require('strip-ansi');
const fs = require('fs');

export class HadesMessage {
    user: string = "system";
    action: string = "";
    emote: boolean = false;
    sysMessage: boolean = false;
    directed: boolean = false;
    directedTarget: string = "";
    text: string;
    private: boolean= false;
    ignore: boolean;
}

export class HadesClient extends Event
{
    private self = this;
    private option = {
        host:'hades-talker.org',
        port: 6660,
        username: "",
        password: ""
    }

    private client: any;
    private loggedIn: boolean = false;

    private currentUsers: Array<string> = [];
    private userInIdle: boolean = false;

	constructor(private params: any) {
        super();
        console.log("Creating hades wrapper");
	}

    public GetUsers(): Array<string> {
        return this.currentUsers;
    }

    public connect(): void {

        if(this.client === undefined) {

            this.option.username = this.params["username"];
            this.option.password = this.params["password"];

            var client = net.createConnection(this.option, function () {
                console.log('Connection local address : ' + client.localAddress + ":" + client.localPort);
                console.log('Connection remote address : ' + client.remoteAddress + ":" + client.remotePort);
            });

            client.setTimeout(60000);
            client.setEncoding('utf8');

            client.on('data', (data) => this.dataReceived(data));

            client.setTimeout(60000);
            client.setEncoding('utf8');
        
            this.client = client;
        }
    }

    private dataReceived(data: any): void {

        if(!this.loggedIn) {
            this.handleLogin(data);
            return;
        }

        // Process given line
        const res = this.processLine(data);

        // Ignore unprocessed lines
        if(res == null) return;

        const logEntry = {
            timestamp: new Date(),
            result: res,
            raw: data,
            clean: stripAnsi(data).trim()
        }

        // Log data to file for debugging
        // fs.appendFile('data.json', JSON.stringify(logEntry) + "\n", (err) => {
        //     if (err) {
        //         throw err;
        //     }
        // });

        // Check if you were moved to the idle and go back to the styx
        if((res.user == "You" && res.action == "emote" && res.text == "are in the idle") 
          || (res.user == "system" && res.action == "sysMessage" && res.text == "You can't talk here")) {
            console.log("In Idle - moving back to styx");
            this.send(".go styx");
        } 

        // Ignore if you were the creating user
        if(res.user == "You" || res.user == this.option.username) return;

        this.emit("message", res);

    }

    private  cleanInput(data) {
        var newString = data.toString().replace("[\u0000-\u001a]", "").replace("[\u001c-\u001f]", "").replace(/(\r\n|\n|\r)/gm,"").replace(/\u001b\[./gm,"");
        while (newString.charAt(0) === " ") newString=newString.substring(1);
        return newString;
    }

    private handleLogin(dataIn: any) {
        dataIn = stripAnsi(dataIn).trim();

        var data = this.cleanInput(dataIn);

        data = data.replace(/[\u{0080}-\u{FFFF}]/gu,"");
        data = data.replace(/[\u{0000}-\u{001F}]/gu,"").trim();

        if(data.endsWith("name:")) {
            console.log("Sending Username");
            this.client.write(this.option.username);
        } else if(data.endsWith("your password :") || data.endsWith("your password:")) {
            console.log("Sending Password");
            this.client.write(this.option.password);
        } else if(data.startsWith("Greetings,") || data.startsWith("-> You are already logged in, switching to old session...")){
            // Get User List
            var sys_lookRegex = /You can see: (.*)/g
            var match = sys_lookRegex.exec(dataIn);
            if(match != null) {
                const users = match[1].trim().split(",");
                this.currentUsers = [];
                for (const user of users) {
                    this.currentUsers.push(user.toLocaleLowerCase().trim());
                }
            }
            this.loggedIn = true;
            this.emit("connected");
            return;
        } else {
            console.log("Got Data: " + data);
        }

    }


    public send(data: any):void {
        if(this.client === undefined) return;

        // Check if user is in the Idle first
        if(this.userInIdle == true) {
            // Move to Styx before talking
            this.client.write(".go styx");
            this.userInIdle = false;
        }

        console.log("Sending: ", data);
        this.client.write(data);
    }


    public testData(filename: string) {

        try {
            // read contents of the file
            const data = fs.readFileSync(filename, 'UTF-8');
        
            // split the contents by new line
            const lines = data.split(/\r?\n/);
        
            let buffer: string = "";

            // print all lines
            lines.forEach((line) => {

                if(line == "") {
                    this.processLine(buffer);
                    buffer = "";
                } else {
                    buffer = buffer + line + "\n";
                }

            });
            
            if(buffer.length > 0) {
                this.processLine(buffer);
            }
        } catch (err) {
            console.error(err);
        }

    }

    private inRoomDesc: boolean = false;

    private processLine(input: string): HadesMessage {


        let out = stripAnsi(input).trim();

        // System Items Regex
        var sys_lookRegex = /^You are in the.*You can see: ([^\n]*)/gs

        // Try and split by user and action
        var myRegexp = /^(>?>?)(\S*) (.*): (.*)/g;

        // URLs
        var urlRegex = /\[URL\] ([^:]*): (.*)/g

        var dsayRegEx = /says to (.*)/g;

        var echoRegEx = /^(\(.+\)|-) (.*)/g;

        var sysMessageRegEx = /^-> (.*)/g;

        var statusChangeRegex = /^-> (.*) (is away|returns)/g;

        var emoteRegex = /^(>?>?)([a-zA-Z]*) (.*)/g;

        var movedToIdle = /^(You are in the idle).*/g

        let details = {}

        const msg : HadesMessage = new HadesMessage();


        //
        // User List (.look)    
        var match = sys_lookRegex.exec(out);
        if(match != null) {
            const users = match[1].trim().split(",");
            this.currentUsers = [];
            for (const user of users) {
                this.currentUsers.push(user.trim());
            }
            
            msg.sysMessage = true;
            msg.action = "look";
            return msg;
        }


        // Handle URLs
        var match = urlRegex.exec(out)
        if(match != null) {
            msg.action = "url"
            msg.text = match[2];
            msg.user = match[1];
            return msg;
        }

        var match = myRegexp.exec(out);

        if(match != null) {
            msg.private = match[1].length > 0;
            msg.user = match[2];
            msg.action = match[3];
            msg.text = match[4];

            // Dsay
            var dsayMatch = dsayRegEx.exec(match[3]);
            if(dsayMatch != null) {
                msg.action = "dsay";
                msg.directed = true;

                if(dsayMatch[1] == "you") {
                    msg.directedTarget = "@YOU"
                } else {
                    msg.directedTarget = dsayMatch[1]
                }
            }
            return msg;
        } 

        //
        // Echo
        var match = echoRegEx.exec(out);
        if(match != null) {

            msg.action = "echo"
            msg.text = match[2];

            if(match[1] != "-") {
                msg.user = match[1];
            } 

            return msg;
        }

        //
        // Status Change
        match = statusChangeRegex.exec(out);
        if(match != null) {

            if(match[2] == "is away") {

            }

            msg.private= false;
            msg.user = match[1];
            msg.action = match[2] == "is away" ? "away" : "returns";
            msg.text = "";

            return msg;
        }

        //
        // Moved to Idle
        match = movedToIdle.exec(out);
        if(match != null) {
            this.userInIdle = true;
            msg.action = "Moved to Idle";
            msg.text = "";
            msg.sysMessage = true;
            return msg;
        }

        //
        // System Message
        var match = sysMessageRegEx.exec(out);
        if(match != null) {
            msg.action = "sysMessage";
            msg.text = match[1];
            msg.sysMessage = true;
            return msg;
        }

        
        match = emoteRegex.exec(out);
        if(match != null) {
            msg.private = match[1].length > 0;
            msg.user = match[2];
            msg.action = "emote";
            msg.emote = true;
            msg.text = match[3];
        
            return msg;
        }

            if(out.length > 0)
            {

                if(out.charCodeAt(0) == 65533 && out.charCodeAt(1) == 65533 && out.charCodeAt(2) == 5)
                {
                    msg.ignore = true;
                    return msg;
                }

                 console.log("Error: " + out  + "  (Length: " + out.length + ")");
            }

            msg.action = "Unknown";
            msg.ignore = true;
            msg.user = "system";
            msg.sysMessage = true;
            msg.text = out;
            return msg;

    }
}