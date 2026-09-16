import { client, type RequestOptions } from "@/lib/api/client";
import { ApiError } from "@/types/api";
import type { User } from "@/types/user";

export type ProfessionalKind = "doctors" | "nurses";
export const professionalKind = (user: User | null | undefined): ProfessionalKind | undefined =>
  user?.accountRole === "doctor" ? "doctors" : user?.accountRole === "nurse" ? "nurses" : undefined;

interface ProfileWire {
  doctor_id?: string;
  nurse_id?: string;
  user_id: string;
  first_name: string;
  last_name: string;
  specialty: string | null;
  bio: string | null;
  languages: string[];
  photo_url: string | null;
  is_listable: boolean;
  is_active: boolean;
}
export interface ProfessionalProfile {
  id: string;
  userId: string;
  kind: ProfessionalKind;
  firstName: string;
  lastName: string;
  specialty: string | null;
  bio: string | null;
  languages: string[];
  photoUrl: string | null;
  isListable: boolean;
  isActive: boolean;
}
export interface ProfessionalChanges {
  first_name?: string;
  last_name?: string;
  specialty?: string | null;
  bio?: string | null;
  languages?: string[];
  is_listable?: boolean;
}
function adapt(wire: ProfileWire, kind: ProfessionalKind, owner: string): ProfessionalProfile {
  const id = kind === "doctors" ? wire.doctor_id : wire.nurse_id;
  if (!id || wire.user_id !== owner) throw new ApiError("Profile identity mismatch", 502);
  return {
    id,
    kind,
    userId: wire.user_id,
    firstName: wire.first_name,
    lastName: wire.last_name,
    specialty: wire.specialty,
    bio: wire.bio,
    languages: wire.languages,
    photoUrl: wire.photo_url,
    isListable: wire.is_listable,
    isActive: wire.is_active,
  };
}
export const professionalApi = {
  async getSelf(kind: ProfessionalKind, owner: string, options?: RequestOptions) {
    return adapt(await client.get<ProfileWire>(`/v1/${kind}/me`, options), kind, owner);
  },
  async updateSelf(
    kind: ProfessionalKind,
    owner: string,
    changes: ProfessionalChanges,
    options?: RequestOptions,
  ) {
    return adapt(await client.patch<ProfileWire>(`/v1/${kind}/me`, changes, options), kind, owner);
  },
};
