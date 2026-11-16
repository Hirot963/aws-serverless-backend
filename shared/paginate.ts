import { QueryCommand, QueryCommandInput, ScanCommand, ScanCommandInput } from "@aws-sdk/lib-dynamodb";
import { db } from "./db";

export const queryAll = async (input: QueryCommandInput) => {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const r = await db.send(new QueryCommand({ ...input, ExclusiveStartKey: lastKey }));
    items.push(...(r.Items ?? []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
};

export const scanAll = async (input: ScanCommandInput) => {
  const items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const r = await db.send(new ScanCommand({ ...input, ExclusiveStartKey: lastKey }));
    items.push(...(r.Items ?? []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
};
