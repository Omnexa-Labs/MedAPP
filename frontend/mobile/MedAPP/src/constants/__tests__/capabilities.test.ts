import { hasCapability, capabilitiesFor } from "@/constants/capabilities";

describe("capabilities", () => {
  describe("guests", () => {
    it("can browse content", () => {
      expect(hasCapability("browseContent", { role: "guest" })).toBe(true);
    });
    it("cannot use medical chat", () => {
      expect(hasCapability("useMedicalChat", { role: "guest" })).toBe(false);
    });
    it("cannot apply to become a partner (must sign in first)", () => {
      expect(hasCapability("applyToBecomePartner", { role: "guest" })).toBe(false);
    });
  });

  describe("regular users", () => {
    it("can use the medical chat and sync wearables", () => {
      expect(hasCapability("useMedicalChat", { role: "user" })).toBe(true);
      expect(hasCapability("syncWearables", { role: "user" })).toBe(true);
    });
    it("can apply to become a partner", () => {
      expect(hasCapability("applyToBecomePartner", { role: "user" })).toBe(true);
    });
    it("CANNOT author a channel or publish a blog post", () => {
      expect(hasCapability("authorChannel", { role: "user" })).toBe(false);
      expect(hasCapability("publishBlogPost", { role: "user" })).toBe(false);
    });
  });

  describe("partners", () => {
    it("practitioners can author channels, publish, and accept consultations", () => {
      const ctx = { role: "partner" as const, partnerKind: "practitioner" as const };
      expect(hasCapability("authorChannel", ctx)).toBe(true);
      expect(hasCapability("publishBlogPost", ctx)).toBe(true);
      expect(hasCapability("acceptConsultation", ctx)).toBe(true);
      expect(hasCapability("managePharmacyListing", ctx)).toBe(false);
    });
    it("pharmacies can manage pharmacy listings but not consultations", () => {
      const ctx = { role: "partner" as const, partnerKind: "pharmacy" as const };
      expect(hasCapability("managePharmacyListing", ctx)).toBe(true);
      expect(hasCapability("acceptConsultation", ctx)).toBe(false);
    });
    it("hospitals can manage hospital listings but not pharmacy listings", () => {
      const ctx = { role: "partner" as const, partnerKind: "hospital" as const };
      expect(hasCapability("manageHospitalListing", ctx)).toBe(true);
      expect(hasCapability("managePharmacyListing", ctx)).toBe(false);
    });
    it("partner without a kind set falls back to user capabilities", () => {
      const ctx = { role: "partner" as const };
      expect(hasCapability("useMedicalChat", ctx)).toBe(true);
      expect(hasCapability("authorChannel", ctx)).toBe(false);
    });
  });

  describe("capabilitiesFor", () => {
    it("returns the merged set for a practitioner partner", () => {
      const caps = capabilitiesFor({ role: "partner", partnerKind: "practitioner" });
      expect(caps).toContain("useMedicalChat");
      expect(caps).toContain("authorChannel");
      expect(caps).toContain("acceptConsultation");
    });
    it("returns just guest capabilities for guests", () => {
      const caps = capabilitiesFor({ role: "guest" });
      expect(caps).toEqual(["browseContent"]);
    });
  });
});
