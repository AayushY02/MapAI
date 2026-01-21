CREATE TABLE "line_mesh_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer NOT NULL,
	"mesh_id" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"length_m" double precision NOT NULL,
	"length_ratio" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "polygon_mesh_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"polygon_id" integer NOT NULL,
	"mesh_id" text NOT NULL,
	"geometry" jsonb NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"area_m2" double precision NOT NULL,
	"area_ratio" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "line_mesh_map" ADD CONSTRAINT "line_mesh_map_line_id_line_features_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."line_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_mesh_map" ADD CONSTRAINT "line_mesh_map_mesh_id_mesh_index_mesh_id_fk" FOREIGN KEY ("mesh_id") REFERENCES "public"."mesh_index"("mesh_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polygon_mesh_map" ADD CONSTRAINT "polygon_mesh_map_polygon_id_polygon_features_id_fk" FOREIGN KEY ("polygon_id") REFERENCES "public"."polygon_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polygon_mesh_map" ADD CONSTRAINT "polygon_mesh_map_mesh_id_mesh_index_mesh_id_fk" FOREIGN KEY ("mesh_id") REFERENCES "public"."mesh_index"("mesh_id") ON DELETE cascade ON UPDATE no action;