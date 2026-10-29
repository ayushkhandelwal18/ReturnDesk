import { endpoint, jsonBody } from '@/lib/api';
import { idInput, noteInput } from '@/lib/validation';
import { addNote } from '@/lib/requests';

export const runtime = 'nodejs';
export const POST = endpoint(async (request, { params }) => addNote(
  idInput.parse((await params).id), noteInput.parse(await jsonBody(request)),
), 201);
