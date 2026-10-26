-- supabase/seed.sql
-- Seed project rows for RCD Status Map

insert into public.projects (name, map_url, legend_x, legend_y)
values
  ('Balayan, Batangas', '/maps/balayan.jpg', 0.355, 0.855),
  ('Norzagaray, Bulacan', '/maps/bulacan.jpg', 0.3, 0.885),
  ('Mariveles, Bataan', '/maps/mariveles.jpg', 0.4, 0.86),
  ('Silang, Cavite', '/maps/silang.jpg', 0.38, 0.925),
  ('Villas de Trece, Cavite', '/maps/trece.jpg', 0.3, 0.915),
  ('Tuy, Batangas', '/maps/tuy.jpg', 0.715, 0.09)
on conflict do nothing;
