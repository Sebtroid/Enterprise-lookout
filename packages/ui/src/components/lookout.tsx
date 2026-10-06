import type { ComponentProps } from "react";
import { cn } from "@crm/ui/lib/utils";

export function LookoutGrid(props:ComponentProps<'div'>) {return <div {...props} className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3',props.className)}/>;}
export function LookoutCard(props:ComponentProps<'div'>) {return <div {...props} className={cn('rounded-lg border bg-card p-5 flex flex-col gap-4',props.className)}/>;}
export function LookoutMetrics({items}:{items:{label:string,value:string,detail?:string}[]}) {return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map(item=><div key={item.label} className="rounded-lg border p-5"><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-medium tabular-nums">{item.value}</p>{item.detail&&<p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>}</div>)}</div>;}
export function LookoutContext(props:ComponentProps<'div'>) {return <div {...props} className="flex flex-wrap items-end gap-4 border-b bg-background px-6 py-3"/>;}
export function LookoutRow(props:ComponentProps<'div'>) {return <div {...props} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"/>;}
