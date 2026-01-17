"use client"

import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function MonitorPage() {
  const params = useParams()
  const productId = params.productId as string

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Monitoring Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Product ID: {productId}
          </p>
          <p className="text-muted-foreground mt-2">
            Monitoring features coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
