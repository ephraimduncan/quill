"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProductCardProps {
  id: string;
  name: string;
  newThreadCount: number;
}

export function ProductCard({ id, name, newThreadCount }: ProductCardProps): React.ReactElement {
  return (
    <Link href={`/monitor/${id}`}>
      <Card className="hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer">
        <CardHeader>
          <CardTitle>{name}</CardTitle>
          {newThreadCount > 0 && (
            <CardAction>
              <Badge>{newThreadCount} new</Badge>
            </CardAction>
          )}
        </CardHeader>
      </Card>
    </Link>
  );
}
