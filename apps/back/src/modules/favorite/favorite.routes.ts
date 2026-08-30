import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export function favoriteRoutes(fastify: FastifyInstance){
    fastify.post('/favorites', async (request: FastifyRequest, reply: FastifyReply) => {
        console.log(request.body)
    })
}