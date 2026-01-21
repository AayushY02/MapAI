CREATE TABLE "layer_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"layer_name" text NOT NULL,
	"table_name" text NOT NULL,
	"geometry_type" text NOT NULL,
	"mesh_map_table" text,
	"source_file" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "layer_registry_layer_name_unique" UNIQUE("layer_name")
);
--> statement-breakpoint
ALTER TABLE "line_features" ADD COLUMN "source_layer" text NOT NULL;--> statement-breakpoint
ALTER TABLE "line_mesh_map" ADD COLUMN "source_layer" text NOT NULL;--> statement-breakpoint
ALTER TABLE "mesh_index" ADD COLUMN "layer_presence" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "point_features" ADD COLUMN "source_layer" text NOT NULL;--> statement-breakpoint
ALTER TABLE "polygon_features" ADD COLUMN "source_layer" text NOT NULL;--> statement-breakpoint
ALTER TABLE "polygon_mesh_map" ADD COLUMN "source_layer" text NOT NULL;