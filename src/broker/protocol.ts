import * as z from 'zod/v4';
import { operationSchema } from '../security/approvals.js';

export const brokerActionSchema=z.discriminatedUnion('type',[
  ...operationSchema.options,
  z.object({type:z.literal('docker.status'),container:z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)}).strict(),
  z.object({type:z.literal('deploy.status')}).strict()
]);
export type BrokerAction=z.infer<typeof brokerActionSchema>;
export const brokerRequestSchema=z.object({
  secret:z.string().min(32).max(512),
  operation:brokerActionSchema
}).strict();
