import { endpoint, jsonBody } from '@/lib/api';
import { idInput, updateInput } from '@/lib/validation';
import { getRequest, updateRequest, deleteRequest } from '@/lib/requests';

export const runtime = 'nodejs';
export const GET = endpoint(async (_request, { params }) => getRequest(idInput.parse((await params).id)));
export const PATCH = endpoint(async (request, { params }) => updateRequest(
  idInput.parse((await params).id), updateInput.parse(await jsonBody(request)),
));
export const DELETE = endpoint(async (_request, { params }) => deleteRequest(idInput.parse((await params).id)));
