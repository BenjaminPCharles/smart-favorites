import type { FastifyInstance } from 'fastify'

export function healthRoutes(fastify: FastifyInstance): void {
  fastify.get('/', (_, reply) => {
    reply.send({ message: 'Hello World' })
  })
}
