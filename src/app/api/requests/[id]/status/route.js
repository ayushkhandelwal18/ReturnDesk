import { endpoint, jsonBody } from '@/lib/api';
import { idInput, statusInput } from '@/lib/validation';
import { changeStatus } from '@/lib/requests';

export const runtime = 'nodejs';
export const PATCH = endpoint(async (request, { params }) => changeStatus(
  idInput.parse((await params).id), statusInput.parse(await jsonBody(request)),
));
