import { Request,Response } from "express";
import {registerSchema } from "../dto/register.dto";
import { AuthService } from "../services/auth.service";
import { loginSchema } from "../dto/login.dto";

const authService = new AuthService();

export class AuthController {
    async register(req: Request,res:Response){
        try{
            const data = registerSchema.parse(req.body);
            const user = await authService.register(data);
            return res.status(201).json(user);
        } catch(error:any){
            return res.status(400).json({
                message: error.message,
            });
        }
    }

    async login(req:Request,res:Response){
        try{
            const data = loginSchema.parse(req.body);

            const result = await authService.Login(
                data.email,
                data.password
            );

            return res.status(200).json(result);
        } catch(error:any){
            return res.status(400).json({
                message: error.message,
            })
        }
    }

    async me(req: Request, res: Response){
        return res.status(200).json({
            user: req.user,
        });
    }
}