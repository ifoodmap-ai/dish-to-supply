-- Create inquiries table to store quote requests
CREATE TABLE public.inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL,
  supplier_name TEXT NOT NULL,
  products JSONB NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- Users can view their own inquiries
CREATE POLICY "Users can view their own inquiries"
ON public.inquiries
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own inquiries
CREATE POLICY "Users can create their own inquiries"
ON public.inquiries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own inquiries
CREATE POLICY "Users can update their own inquiries"
ON public.inquiries
FOR UPDATE
USING (auth.uid() = user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_inquiries_updated_at
BEFORE UPDATE ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_inquiries_user_id ON public.inquiries(user_id);
CREATE INDEX idx_inquiries_supplier_id ON public.inquiries(supplier_id);
CREATE INDEX idx_inquiries_status ON public.inquiries(status);