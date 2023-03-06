import { ClientID } from "./types.js";

//types
export type User = { client_id: ClientID, username?: string };
export type ChatRoomMessage = { user: User, ts: number, text:string};
type ServerInterfaceFunction = (client_ids: string[], data: object) => void;
type ClientInterfaceFunction  = (data: any) => void;
import type { SocioSession } from "./core-session.js";
import type { MessageDataObj } from "./core.js";
import type { ClientMessageDataObj } from "./core-client.js";
import { log } from "./logging.js";

export class ServerChatRoom{
    //private
    static #room_ids: Set<number> = new Set();
    static #id_counter: number = 0;
    #room_id: number;
    #users: Set<User> = new Set();
    #messages: Set<ChatRoomMessage> = new Set();

    //public
    history_length:number;
    server_interface: ServerInterfaceFunction;

    constructor(ServerSendToClients: ServerInterfaceFunction, message_history_length:number = 10){
        const room_id = ++ServerChatRoom.#id_counter;
        ServerChatRoom.#room_ids.add(room_id);
        this.#room_id = room_id;
        this.history_length = message_history_length;
        this.server_interface = ServerSendToClients;
    }
    CloseRoom() { ServerChatRoom.#room_ids.delete(this.#room_id);}
    get room_id() { return this.#room_id;}
    static get room_ids() { return ServerChatRoom.#room_ids;}

    Join(client_id:ClientID){
        this.#users.add({ client_id });
        this.server_interface([client_id], { rel:'SocioChatRoom', type:'msg_history', msgs: this.#messages });
    }
    Leave(client_id: ClientID) {this.#users.delete({ client_id });}

    Post(client_id:ClientID, text:string){
        const new_message = { user: { client_id }, ts: (new Date()).getTime(), text };
        this.#messages.add(new_message);
        if(this.#messages.size > this.history_length)
            this.#messages.delete(this.#messages.values().next().value); //remove the first message, if over history limit
        
        //send new message to clients
        const clients = [...this.#users.values()].map(c => c.client_id); //could filter out the current client as well, but that actually complicates things more than solves
        this.server_interface(clients, { rel: 'SocioChatRoom', type: 'new_msg', msgs: [new_message]});
    }
}

export class ChatRoomClient{
    //private
    #current_room_id:number = 0;

    //public
    serv: ClientInterfaceFunction;
    msg_hook: (msg: ChatRoomMessage[]) => void;

    constructor(ClientSendToServer: ClientInterfaceFunction, msg_hook: (msg:ChatRoomMessage[]) => void){
        this.serv = ClientSendToServer;
        this.msg_hook = msg_hook;
    }

    Join(room_id:number){
        this.serv({ rel: 'SocioChatRoom', type: 'join', room_id });
        this.#current_room_id = room_id;
    }
    Leave() { this.serv({ rel: 'SocioChatRoom', type: 'leave', room_id: this.#current_room_id }); }

    Post(text: string) { this.serv({ rel: 'SocioChatRoom', type: 'new_msg', text, room_id: this.#current_room_id });}
    Receive(msgs:ChatRoomMessage[]){this.msg_hook(msgs);}
}

export function HandleChatRoomServ(client: SocioSession, data: MessageDataObj, chat_rooms:ServerChatRoom[]){
    if (data?.data?.rel == 'SocioChatRoom') {
        const chat = chat_rooms.find(c => c.room_id === data.data?.room_id);
        if(!chat) return;
        switch(data.data?.type){
            case 'join': chat.Join(client.id); break;
            case 'leave': chat.Leave(client.id); break;
            case 'new_msg': chat.Post(client.id, data.data?.text); break;
        }
    }
}

export function HandleChatRoomCMD(data:any, chat:ChatRoomClient) {
    if (data?.rel == 'SocioChatRoom') {
        switch (data?.type) {
            case 'msg_history': chat.Receive(Array.from(data?.msgs)); break;
            case 'new_msg': chat.Receive(data?.msgs); break;
        }
    }
}