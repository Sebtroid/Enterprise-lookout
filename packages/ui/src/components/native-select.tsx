import type { ComponentProps } from "react";
import { cn } from "@crm/ui/lib/utils";
export function NativeSelect(props:ComponentProps<'select'>) {return <select {...props} className={cn('h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',props.className)}/>;}
export function NativeSelectOption(props:ComponentProps<'option'>) {return <option {...props}/>;}
