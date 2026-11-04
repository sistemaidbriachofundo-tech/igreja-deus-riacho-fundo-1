import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Seed fictício apenas — sem dados reais da igreja. */
async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "igreja-de-deus" },
    update: {},
    create: {
      name: "Igreja de Deus (demo)",
      slug: "igreja-de-deus",
      churches: {
        create: {
          name: "Riacho Fundo I (demo)",
          slug: "riacho-fundo-1",
        },
      },
    },
  });

  console.log("Seed OK:", org.slug);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
