"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  managedPhotoId,
  PharmacyDetails,
  pharmacyProfileRepository,
} from "@/lib/repositories/pharmacy-profile.repository";

function Photo({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const id = managedPhotoId(url);
  const [preview, setPreview] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let objectUrl = "";
    void pharmacyProfileRepository
      .photo(id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, attempt]);
  return failed ? (
    <p className="rounded-lg bg-slate-100 p-4 text-sm">
      The pharmacy photo could not be loaded.
      {id && (
        <button
          type="button"
          className="ml-2 min-h-11 underline"
          onClick={() => {
            setFailed(false);
            setPreview("");
            setAttempt((value) => value + 1);
          }}
        >
          Retry photo
        </button>
      )}
    </p>
  ) : id && !preview ? (
    <p role="status">Loading pharmacy photo…</p>
  ) : (
    <Image
      unoptimized
      src={id ? preview : url}
      width={720}
      height={360}
      alt={name + " storefront"}
      onError={() => setFailed(true)}
      className="max-h-64 w-full rounded-xl object-cover"
    />
  );
}

export function ProfilePreview({
  details,
  title,
}: {
  details: PharmacyDetails;
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
          {details.name || "Pharmacy name"}
        </h3>
      </div>
      {details.photo_url && (
        <Photo
          key={details.photo_url}
          url={details.photo_url}
          name={details.name}
        />
      )}
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
        {(details.phone || details.email) && (
          <div>
            <dt className="font-medium">Contact</dt>
            <dd className="break-all text-slate-600">
              {details.phone}
              {details.phone && details.email && " · "}
              {details.email}
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
              : "Contact the pharmacy to confirm coverage"}
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
        <div>
          <dt className="font-medium">Services offered</dt>
          <dd>
            {details.services_offered.join(", ") ||
              "Contact the pharmacy to confirm services"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Weekly hours</dt>
          <dd>
            <ul>
              {Object.entries(details.operating_hours || {}).map(
                ([day, hours]) => (
                  <li key={day} className="capitalize">
                    {day}: {hours}
                  </li>
                ),
              )}
            </ul>
            {!Object.keys(details.operating_hours || {}).length &&
              "Hours not provided"}
          </dd>
        </div>
        {details.head_pharmacist_name && (
          <div>
            <dt className="font-medium">Head pharmacist</dt>
            <dd>
              {details.head_pharmacist_name}
              <p className="whitespace-pre-wrap">
                {details.head_pharmacist_bio}
              </p>
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
