/**
 * Ye-Almaz — Seed Lab Department accounts
 * Creates one LAB_TECH login per department
 */
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ACCOUNTS = [
  { name: 'Plaster Department',     email: 'lab.plaster@yealmaz.com',    department: 'PLASTER',      password: 'LabPlaster@2025'     },
  { name: 'Margin Department',      email: 'lab.margin@yealmaz.com',     department: 'MARGIN',       password: 'LabMargin@2025'      },
  { name: 'Scanning',               email: 'lab.scanning@yealmaz.com',   department: 'SCANNING',     password: 'LabScanning@2025'    },
  { name: 'Designing',              email: 'lab.designing@yealmaz.com',  department: 'DESIGNING',    password: 'LabDesigning@2025'   },
  { name: 'Milling / Sintering',    email: 'lab.milling@yealmaz.com',    department: 'MILLING',      password: 'LabMilling@2025'     },
  { name: 'Resin 3D Printing',      email: 'lab.resin@yealmaz.com',      department: 'RESIN_PRINT',  password: 'LabResin@2025'       },
  { name: 'Metal 3D Printing',      email: 'lab.metal3d@yealmaz.com',    department: 'METAL_PRINT',  password: 'LabMetal3D@2025'     },
  { name: 'Metal Finishing',        email: 'lab.metalfinish@yealmaz.com',department: 'METAL_FINISH', password: 'LabMetalFinish@2025' },
  { name: 'Opaque Application',     email: 'lab.opaque@yealmaz.com',     department: 'OPAQUE',       password: 'LabOpaque@2025'      },
  { name: 'Ceramic Layering',       email: 'lab.ceramic@yealmaz.com',    department: 'CERAMIC',      password: 'LabCeramic@2025'     },
  { name: 'Zirconia Fitting',       email: 'lab.zirconia@yealmaz.com',   department: 'ZIRCONIA',     password: 'LabZirconia@2025'    },
  { name: 'Glazing',                email: 'lab.glazing@yealmaz.com',    department: 'GLAZING',      password: 'LabGlazing@2025'     },
  { name: 'Thermo Press',           email: 'lab.thermo@yealmaz.com',     department: 'THERMO',       password: 'LabThermo@2025'      },
  { name: 'Trimming',               email: 'lab.trimming@yealmaz.com',   department: 'TRIMMING',     password: 'LabTrimming@2025'    },
  { name: 'Quality Control',        email: 'lab.qc@yealmaz.com',         department: 'QC',           password: 'LabQC@2025'          },
];

async function main() {
  console.log('Creating lab department accounts…\n');
  for (const acc of ACCOUNTS) {
    const existing = await p.user.findUnique({ where: { email: acc.email } });
    if (existing) {
      console.log(`  ⚠  Already exists: ${acc.email}`);
      continue;
    }
    const hashed = await bcrypt.hash(acc.password, 10);
    await p.user.create({
      data: { name: acc.name, email: acc.email, password: hashed, role: 'LAB_TECH', department: acc.department }
    });
    console.log(`  ✓  ${acc.name}`);
    console.log(`     Email   : ${acc.email}`);
    console.log(`     Password: ${acc.password}`);
    console.log(`     Dept    : ${acc.department}\n`);
  }
  console.log('Done.');
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
