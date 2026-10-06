import { Suspense } from "react";
import { PipelineBoard } from "@/components/lookout/pipeline-board";
export default function SponsorshipPage() {return <Suspense fallback={<p>Cargando auspicios…</p>}><PipelineBoard /></Suspense>;}
