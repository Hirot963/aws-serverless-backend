const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export const ok       = (b: unknown) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(b) });
export const created  = (b: unknown) => ({ statusCode: 201, headers: CORS, body: JSON.stringify(b) });
export const noContent= ()           => ({ statusCode: 204, headers: CORS, body: '' });
export const badReq   = (m: string)  => ({ statusCode: 400, headers: CORS, body: JSON.stringify({ message: m }) });
export const forbidden= (m='Forbidden') => ({ statusCode: 403, headers: CORS, body: JSON.stringify({ message: m }) });
export const notFound = (m='Not found') => ({ statusCode: 404, headers: CORS, body: JSON.stringify({ message: m }) });
export const internal = (m='Internal server error') => ({ statusCode: 500, headers: CORS, body: JSON.stringify({ message: m }) });
