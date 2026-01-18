"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { ProductCardSkeleton } from "@/components/product-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

interface Product {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  newThreadCount: number;
}

const SKELETON_COUNT = 3;

function AddProductButton({ children }: { children: string }): React.ReactNode {
  return (
    <Button asChild>
      <Link href="/setup">
        <Plus data-icon="inline-start" />
        {children}
      </Link>
    </Button>
  );
}

export default function DashboardPage(): React.ReactNode {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts(): Promise<void> {
      try {
        const res = await fetch("/api/products");
        if (!res.ok) {
          if (res.status === 401) {
            setError("Please sign in to view your products");
            return;
          }
          throw new Error("Failed to fetch products");
        }
        const data = await res.json();
        setProducts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Products</h1>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Products</h1>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Products</h1>
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            You haven&apos;t added any products yet.
          </p>
          <AddProductButton>Add Your First Product</AddProductButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <AddProductButton>Add Product</AddProductButton>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            id={product.id}
            name={product.name}
            newThreadCount={product.newThreadCount}
          />
        ))}
      </div>
    </div>
  );
}
