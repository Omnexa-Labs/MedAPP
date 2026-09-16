"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

export function PhotoPicker({
  file,
  hasPhoto,
  disabled,
  canUpload,
  onSelect,
  onUpload,
  onRemove,
}: {
  file: File | null;
  hasPhoto: boolean;
  disabled: boolean;
  canUpload: boolean;
  onSelect: (file: File | null) => void;
  onUpload: () => void;
  onRemove: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <section
      aria-label="Pharmacy photo"
      className="space-y-3 rounded-lg border p-4"
    >
      <label htmlFor="profile-photo" className="block text-sm font-medium">
        Choose pharmacy photo
      </label>
      <p id="photo-help" className="text-sm text-slate-600">
        Choose a still JPEG, PNG or WebP, up to 8 MB and 20 million pixels.
        Upload a photo you have permission to publish. It stays in your draft
        until you publish.
      </p>
      <input
        id="profile-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-describedby="photo-help"
        className="min-h-11 max-w-full text-sm"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (!selected) return;
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(
              selected.type,
            ) ||
            !selected.size ||
            selected.size > 8 * 1024 * 1024
          ) {
            setError("Choose a JPEG, PNG or WebP photo up to 8 MB.");
            onSelect(null);
            return;
          }
          setError("");
          onSelect(selected);
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {file && (
        <>
          <SelectedPhoto
            key={`${file.name}:${file.lastModified}:${file.size}`}
            file={file}
          />
          <p className="break-all text-sm">Selected: {file.name}</p>
          {!canUpload && !disabled && (
            <p className="text-sm text-amber-800">
              Save your other edits before uploading this photo.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="min-h-11"
              disabled={disabled || !canUpload}
              onClick={onUpload}
            >
              Upload to draft
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={disabled}
              onClick={() => onSelect(null)}
            >
              Clear selection
            </Button>
          </div>
        </>
      )}
      {hasPhoto && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove draft photo
        </Button>
      )}
    </section>
  );
}

function SelectedPhoto({ file }: { file: File }) {
  const attach = useCallback(
    (node: HTMLImageElement | null) => {
      if (!node) return;
      const preview = URL.createObjectURL(file);
      node.src = preview;
      return () => {
        node.removeAttribute("src");
        URL.revokeObjectURL(preview);
      };
    },
    [file],
  );
  return (
    // A browser-local File preview has no server URL for Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={attach}
      width={640}
      height={360}
      alt="Selected pharmacy photo"
      className="max-h-48 w-full rounded-lg object-contain"
    />
  );
}
