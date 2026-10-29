import { ApiError, endpoint, jsonBody } from '@/lib/api';
import { createInput, listInput } from '@/lib/validation';
import { createRequest, listRequests } from '@/lib/requests';

export const runtime = 'nodejs';
export const GET = endpoint(async (request) => {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (params.getAll(key).length > 1) {
      throw new ApiError(422, 'VALIDATION_ERROR', `Query parameter ${key} must appear only once.`);
    }
  }
  return listRequests(listInput.parse(Object.fromEntries(params)));
});
export const POST = endpoint(async (request) => createRequest(createInput.parse(await jsonBody(request))), 201);
