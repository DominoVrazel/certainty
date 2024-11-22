import {Request, Response} from 'express';
import { App, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';


interface ResetPasswordData {
    uuid: string;
    newPassword: string;
}

interface UserSession {
    uuid: string;
    email: string;
}

export class ResetPasswordController {
    constructor(   
        private app: App,
        private auth: Auth,
        private db: Firestore
    ) {}

    async resetPassword(req: Request, res: Response) {
    try {
        const body = req.body.data as ResetPasswordData;

        const snapshot = await this.db.collection("user_sessions").where("uuid", "==", body.uuid).get();

        if (snapshot.empty) {
            return res.status(404).send("User not found 1");
        }

        const userSession = snapshot.docs[0].data() as UserSession;
        const userEmail = userSession.email;

        let userAuth;
        try {
            userAuth =  await this.auth.getUserByEmail(userEmail);
        } catch (error) {
            return res.status(404).send("User not found 2");
        }

        await this.auth.updateUser(userAuth.uid, {
            password: body.newPassword
        });

        return res.status(200).send({ data: {status: "Updated" }});
    } catch(err) {
        if (err instanceof Error)
         return res.status(500).send({err: err, message: err.message, body: req.body});
    }

    }


}