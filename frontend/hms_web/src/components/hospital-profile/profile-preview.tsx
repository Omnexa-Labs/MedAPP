import { HospitalDetails } from "@/lib/repositories/hospital-profile.repository";

export function ProfilePreview({
  details,
  title,
}: {
  details: HospitalDetails;
  title: string;
}) {
  return (
    <section
      aria-label={title}
      className="space-y-4 rounded-xl border bg-white p-6"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-teal-700">
        {title}
      </h2>
      <div>
        <h3 className="break-words text-2xl font-semibold">
          {details.name || "Hospital name"}
        </h3>
        {details.specialty && (
          <p className="mt-1 text-teal-800">{details.specialty}</p>
        )}
      </div>
      {details.description && (
        <p className="whitespace-pre-wrap break-words text-slate-600">
          {details.description}
        </p>
      )}
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-medium">Location</dt>
          <dd className="break-words text-slate-600">
            {[details.address_line1, details.city, details.country]
              .filter(Boolean)
              .join(", ") || "No address added"}
          </dd>
        </div>
        {(details.contact_phone || details.contact_email) && (
          <div>
            <dt className="font-medium">Contact</dt>
            <dd className="break-all text-slate-600">
              {details.contact_phone}
              {details.contact_phone && details.contact_email && " · "}
              {details.contact_email}
            </dd>
          </div>
        )}
        {details.website_url && (
          <div>
            <dt className="font-medium">Website</dt>
            <dd className="break-all text-slate-600">{details.website_url}</dd>
          </div>
        )}
        <div>
          <dt className="font-medium">Accepted insurance</dt>
          <dd className="break-words text-slate-600">
            {details.insurance_accepted.length
              ? details.insurance_accepted.join(", ")
              : "Contact the hospital to confirm coverage"}
          </dd>
        </div>
        {details.latitude !== null && details.longitude !== null && (
          <div>
            <dt className="font-medium">Map coordinates</dt>
            <dd className="text-slate-600">
              {details.latitude}, {details.longitude}
            </dd>
          </div>
        )}
      </dl>
      <p className="text-xs text-slate-500">
        Preview of directory information. Patient screens may arrange these
        details differently.
      </p>
    </section>
  );
}
