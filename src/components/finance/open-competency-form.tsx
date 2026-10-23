"use client";

import { useActionState } from "react";

import { openCompetencyAction, type OpenCompetencyState } from "@/app/actions/competencies";
import { Button } from "@/components/ui/button";

const initialState: OpenCompetencyState = { error: null };

interface OpenCompetencyFormProps {
  /** "2026-10" */
  referenceMonth: string;
  label: string;
}

export function OpenCompetencyForm({ referenceMonth, label }: OpenCompetencyFormProps) {
  const [state, formAction, pending] = useActionState(openCompetencyAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-center gap-2">
      <input type="hidden" name="referenceMonth" value={referenceMonth} />
      <Button type="submit" disabled={pending}>
        {pending ? "Abrindo…" : `Abrir competência de ${label}`}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
