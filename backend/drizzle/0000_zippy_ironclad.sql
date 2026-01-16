CREATE TABLE "line_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"mesh_id" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mesh_index" (
	"mesh_id" text PRIMARY KEY NOT NULL,
	"has_points" boolean DEFAULT false NOT NULL,
	"has_lines" boolean DEFAULT false NOT NULL,
	"has_polygons" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "point_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"mesh_id" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "polygon_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"mesh_id" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "line_features" ADD CONSTRAINT "line_features_mesh_id_mesh_index_mesh_id_fk" FOREIGN KEY ("mesh_id") REFERENCES "public"."mesh_index"("mesh_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_features" ADD CONSTRAINT "point_features_mesh_id_mesh_index_mesh_id_fk" FOREIGN KEY ("mesh_id") REFERENCES "public"."mesh_index"("mesh_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polygon_features" ADD CONSTRAINT "polygon_features_mesh_id_mesh_index_mesh_id_fk" FOREIGN KEY ("mesh_id") REFERENCES "public"."mesh_index"("mesh_id") ON DELETE cascade ON UPDATE no action;