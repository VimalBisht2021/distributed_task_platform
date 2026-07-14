import { prisma} from "../config/prisma";

export class UserRepository {
    async findByEmail(email:string){
        return prisma.user.findUnique({
            where:{
                email,
            },
        });
    }

    async create(data: {
        email: string;
        passwordHash:string;
    }) {
        return prisma.user.create({
            data,
        });
    }
}