-- BMI calculator: products are suggested when a shopper's BMI falls inside this range.
ALTER TABLE "Product" ADD COLUMN "bmiMin" DECIMAL(4,1),
ADD COLUMN "bmiMax" DECIMAL(4,1);
