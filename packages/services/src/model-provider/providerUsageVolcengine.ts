import { createHash, createHmac } from "node:crypto";
export function signVolcengineUsage(input: {
  accessKeyId: string;
  secretKey: string;
  region: string;
  planKind: "agent" | "coding";
  now?: Date;
}) {
  const date = (input.now ?? new Date())
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const day = date.slice(0, 8);
  const query = new URLSearchParams({
    Action: input.planKind === "agent" ? "GetAFPUsage" : "GetCodingPlanUsage",
    Region: input.region,
    Version: "2024-01-01",
  }).toString();
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const mac = (key: string | Buffer, value: string) =>
    createHmac("sha256", key).update(value).digest();
  const contentHash = hash("");
  const signed = "host;x-date;x-content-sha256;content-type";
  const contentType = "application/json; charset=utf-8";
  const canonical = `POST\n/\n${query}\nhost:open.volcengineapi.com\nx-date:${date}\nx-content-sha256:${contentHash}\ncontent-type:${contentType}\n\n${signed}\n${contentHash}`;
  const scope = `${day}/${input.region}/ark/request`;
  const signing = mac(mac(mac(mac(input.secretKey, day), input.region), "ark"), "request");
  return {
    url: `https://open.volcengineapi.com/?${query}`,
    headers: {
      Authorization: `HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${mac(signing, `HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).toString("hex")}`,
      "X-Date": date,
      "X-Content-Sha256": contentHash,
      "Content-Type": contentType,
    },
    body: "",
  };
}
