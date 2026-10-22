-- BMI calculator: a size can have its own range; empty means it uses the product range.
ALTER TABLE "Variant" ADD COLUMN "bmiMin" DECIMAL(4,1),
ADD COLUMN "bmiMax" DECIMAL(4,1);
