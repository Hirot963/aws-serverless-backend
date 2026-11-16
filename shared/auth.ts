import { APIGatewayProxyEvent } from "aws-lambda";

export interface Caller {
  sub: string | undefined;
  groups: string[];
  isSeller: boolean;
}

export const getCaller = (e: APIGatewayProxyEvent): Caller => {
  const claims = e.requestContext?.authorizer?.claims;
  const groupsRaw = claims?.["cognito:groups"];
  const groups: string[] = Array.isArray(groupsRaw)
    ? groupsRaw
    : typeof groupsRaw === "string"
      ? groupsRaw.replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean)
      : [];
  return {
    sub: claims?.sub,
    groups,
    isSeller: groups.includes("seller"),
  };
};

export const parseJsonBody = (
  body: string | null,
): { ok: true; value: any } | { ok: false } => {
  if (!body) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
};
