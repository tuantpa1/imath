/**
 * Seed test accounts for local development.
 * Safe to run multiple times — skips existing usernames.
 *
 * Usage: npm run seed:test  (from backend/)
 */

import { db } from './db';
import { hashPassword } from '../services/authService';

interface AccountSpec {
  username: string;
  password: string;
  displayName: string;
  role: 'teacher' | 'parent' | 'student';
  linkToParent?: string; // username of parent to link to
}

const ACCOUNTS: AccountSpec[] = [
  // Parents
  { username: 'phuhuynhA', password: 'test123', displayName: 'Phụ huynh A', role: 'parent' },
  { username: 'phuhuynhB', password: 'test123', displayName: 'Phụ huynh B', role: 'parent' },

  // Students
  { username: 'hocsinh1', password: 'test123', displayName: 'Nguyễn Văn An',  role: 'student', linkToParent: 'phuhuynhA' },
  { username: 'hocsinh2', password: 'test123', displayName: 'Trần Thị Bình',  role: 'student', linkToParent: 'phuhuynhA' },
  { username: 'hocsinh3', password: 'test123', displayName: 'Lê Minh Châu',   role: 'student', linkToParent: 'phuhuynhB' },
  { username: 'hocsinh4', password: 'test123', displayName: 'Phạm Thu Dung',  role: 'student', linkToParent: 'phuhuynhB' },
];

async function seed() {
  console.log('─── iMath test account seeder ───────────────────────────');

  const results: { username: string; role: string; status: 'created' | 'skipped'; linkedTo?: string }[] = [];

  // teacher account is seeded by db.ts — just report it
  const teacher = db.prepare("SELECT id FROM users WHERE username = 'teacher'").get() as { id: number } | undefined;
  results.push({ username: 'teacher', role: 'teacher', status: teacher ? 'skipped' : 'skipped' });

  for (const spec of ACCOUNTS) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(spec.username) as { id: number } | undefined;

    if (existing) {
      results.push({ username: spec.username, role: spec.role, status: 'skipped' });
      continue;
    }

    const hash = await hashPassword(spec.password);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run(spec.username, hash, spec.role, spec.displayName);

    const newId = result.lastInsertRowid as number;

    let linkedTo: string | undefined;
    if (spec.linkToParent) {
      const parent = db.prepare('SELECT id FROM users WHERE username = ?').get(spec.linkToParent) as { id: number } | undefined;
      if (parent) {
        db.prepare('INSERT OR IGNORE INTO family_links (parent_id, student_id) VALUES (?, ?)').run(parent.id, newId);
        linkedTo = spec.linkToParent;
      }
    }

    results.push({ username: spec.username, role: spec.role, status: 'created', linkedTo });
  }

  // Print summary table
  console.log('');
  console.log('  Status    Role      Username       Display Name          Linked To');
  console.log('  ────────  ────────  ─────────────  ────────────────────  ─────────────');

  const displayNames: Record<string, string> = {
    teacher: 'Giáo viên',
    phuhuynhA: 'Phụ huynh A',
    phuhuynhB: 'Phụ huynh B',
    hocsinh1: 'Nguyễn Văn An',
    hocsinh2: 'Trần Thị Bình',
    hocsinh3: 'Lê Minh Châu',
    hocsinh4: 'Phạm Thu Dung',
  };

  for (const r of results) {
    const status  = r.status === 'created' ? '✅ created' : '⏭  skipped';
    const role    = r.role.padEnd(8);
    const uname   = r.username.padEnd(13);
    const dname   = (displayNames[r.username] ?? '').padEnd(20);
    const link    = r.linkedTo ? `→ ${r.linkedTo}` : '';
    console.log(`  ${status}  ${role}  ${uname}  ${dname}  ${link}`);
  }

  // Verify family links
  console.log('');
  console.log('  Family links:');
  const links = db.prepare(`
    SELECT p.username AS parent, s.username AS student, s.display_name
    FROM family_links fl
    JOIN users p ON p.id = fl.parent_id
    JOIN users s ON s.id = fl.student_id
    ORDER BY p.username, s.username
  `).all() as Array<{ parent: string; student: string; display_name: string }>;

  for (const l of links) {
    console.log(`    ${l.parent.padEnd(14)} ← ${l.student.padEnd(12)} (${l.display_name})`);
  }

  console.log('');
  console.log('─────────────────────────────────────────────────────────');
  console.log('  All accounts use password: test123');
  console.log('  teacher uses password: teacher123');
  console.log('─────────────────────────────────────────────────────────');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
