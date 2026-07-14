import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { RegisterDto } from "../dto/register.dto";
import { UserRepository } from "../repositories/user.repository";
import { LoginDto } from "../dto/login.dto";

export class AuthService{
    private userRepository = new UserRepository();
    async register(data:RegisterDto){
        const existingUser = await this.userRepository.findByEmail(data.email);

        if(existingUser){
            throw new Error("User already exists");
        }

        const passwordHash = await bcrypt.hash(data.password,10);

        const user = await this.userRepository.create({
            email:data.email,
            passwordHash,
        });

        return{
            id:user.id,
            email:user.email,
            role:user.role,
        };
    }
    
    async Login(email:string,password:string){
        const user = await this.userRepository.findByEmail(email);
        if(!user){
            throw new Error("Invalid credentials");
        }

        const isValid = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if(!isValid){
            throw new Error("Invalid credentials");
        }

        const token = jwt.sign({
            userId: user.id,
            email: user.email,
            role: user.role,
        },
        process.env.JWT_SECRET!,
        {
            expiresIn: "1d",
        }
        );
        return token;
    }
}