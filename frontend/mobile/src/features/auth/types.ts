export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

export type AuthApiUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
};

export const toAuthUser = (raw: AuthApiUser): AuthUser => ({
  id: raw.id,
  email: raw.email,
  fullName: raw.full_name,
  role: raw.role,
});

export type LoginResult = {
  accessToken: string;
  user: AuthUser;
};
