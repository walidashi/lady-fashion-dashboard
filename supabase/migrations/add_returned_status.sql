-- Add 'returned' to the orders status check constraint
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new','preparing','ready','shipped','returned','delivered','cancelled'));
