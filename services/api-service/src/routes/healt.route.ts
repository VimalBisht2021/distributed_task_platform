import { Router } from "express";
import {prisma} from "../config/prisma";

const router = Router();
router.get("/",async(_req,res)=>{
    try{
        await prisma.$queryRaw`SELECT 1`;

        return res.status(200).json({
            status:"ok",
            database: "connected",
            service: "api-service",
        });
    }catch(error){
        return res.status(500).json({
            status:"error",
            database: "disconnected",
            service: "api-service",
        });
    }
});



export default router;