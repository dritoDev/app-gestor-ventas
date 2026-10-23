ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_delta_not_zero" CHECK ("inventory_movements"."delta" <> 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_positive" CHECK ("products"."stock" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_positive" CHECK ("products"."price_cents" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_positive" CHECK ("products"."min_stock" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_active_boolean" CHECK ("products"."active" in (0, 1));--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive" CHECK ("sale_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_positive" CHECK ("sales"."total_cents" >= 0);