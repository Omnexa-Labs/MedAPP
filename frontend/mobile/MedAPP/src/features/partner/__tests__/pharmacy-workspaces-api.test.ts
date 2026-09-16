import { client } from "@/lib/api/client";
import { getPharmacyWorkspaces } from "../pharmacy-workspaces-api";
jest.mock("@/lib/api/client", () => ({ client: { get: jest.fn() } }));
jest.mock("@/lib/config", () => ({ config: { appEnv: "production" } }));
jest.mock("expo-web-browser", () => ({}));
const workspace = {
  pharmacy_id: "33333333-3333-4333-8333-333333333333",
  pharmacy_name: "Care Pharmacy",
  deployment_key: "accra",
  web_origin: "https://pharmacy.example",
};
beforeEach(() => jest.clearAllMocks());
it("projects only public workspace fields and forwards the session guard", async () => {
  jest.mocked(client.get).mockResolvedValue([{ ...workspace, internal: "private" }]);
  const options = { isSessionCurrent: () => true };
  await expect(getPharmacyWorkspaces(options)).resolves.toEqual([workspace]);
  expect(client.get).toHaveBeenCalledWith("/v1/pharmacy-workspaces", options);
});
it.each([
  null,
  {},
  [{ ...workspace, pharmacy_id: "invalid" }],
  [{ ...workspace, deployment_key: "../other" }],
  [workspace, workspace],
  [{ ...workspace, web_origin: "http://remote.example" }],
  [{ ...workspace, web_origin: "https://pharmacy.example/other" }],
  [{ ...workspace, web_origin: "https://user:secret@pharmacy.example" }],
  [{ ...workspace, web_origin: "https://pharmacy.example?redirect=other" }],
])("rejects malformed or unsafe workspace data: %j", async (value) => {
  jest.mocked(client.get).mockResolvedValue(value);
  await expect(getPharmacyWorkspaces({})).rejects.toThrow();
});
