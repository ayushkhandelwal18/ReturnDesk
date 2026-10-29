import { endpoint, jsonBody } from '@/lib/api';
import { createInput } from '@/lib/validation';
import { createRequest } from '@/lib/requests';

export const runtime = 'nodejs';
export const POST = endpoint(async (request) => createRequest(createInput.parse(await jsonBody(request))), 201);
