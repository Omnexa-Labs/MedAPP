"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { staffRepository } from "@/lib/repositories/staff.repository";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () =>
      staffRepository.listDepartments({ limit: 100 }).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      staffRepository.createDepartment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setName("");
      setDescription("");
      setSlug("");
      setShowForm(false);
    },
  });

  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
      ? data
      : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      slug: slug.trim() || name.trim().toLowerCase().replace(/\s+/g, "-"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Departments</h1>
        <Button
          onClick={() => setShowForm((prev) => !prev)}
          variant={showForm ? "outline" : "default"}
        >
          {showForm ? "Cancel" : "Add Department"}
        </Button>
      </div>

      {/* Inline Add Department Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New Department</CardTitle>
          </CardHeader>
          <CardContent>
            {createMutation.isError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Failed to create department. Please try again.
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Emergency Department"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Slug{" "}
                    <span className="text-xs text-slate-400">
                      (auto-generated if empty)
                    </span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. emergency-department"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Description
                </label>
                <Textarea
                  placeholder="Brief description of the department"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Department"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Departments Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <LoadingSkeleton lines={3} />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No departments yet"
          description="Create your first department to get started."
          action={
            !showForm ? (
              <Button onClick={() => setShowForm(true)}>Add Department</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((dept: Record<string, unknown>) => (
            <Card key={dept.department_id as string}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {dept.name as string}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dept.description ? (
                  <p className="text-sm text-slate-600">
                    {String(dept.description)}
                  </p>
                ) : null}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {(dept.slug as string) ||
                      (dept.name as string)
                        ?.toLowerCase()
                        .replace(/\s+/g, "-")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
