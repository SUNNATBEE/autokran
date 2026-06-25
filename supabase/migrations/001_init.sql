-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create cranes table
CREATE TABLE IF NOT EXISTS public.cranes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  capacity_tons NUMERIC NOT NULL,
  boom_length_m NUMERIC,
  price_per_day NUMERIC,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance')),
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crane_id UUID NOT NULL REFERENCES public.cranes(id) ON DELETE RESTRICT,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  location TEXT,
  start_date DATE,
  end_date DATE,
  total_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cranes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can read their own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Create a policy allowing service role full access to users (needed for custom auth)
CREATE POLICY "Service role can do anything on users" ON public.users
  USING (true) WITH CHECK (true);

-- Cranes policies
CREATE POLICY "Anyone can read cranes" ON public.cranes
  FOR SELECT USING (true);

CREATE POLICY "Admin can do anything on cranes" ON public.cranes
  USING (true) WITH CHECK (true); -- We will rely on service_role for admin actions

-- Bookings policies
CREATE POLICY "Service role can do anything on bookings" ON public.bookings
  USING (true) WITH CHECK (true);
