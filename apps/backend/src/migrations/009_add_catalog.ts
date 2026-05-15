import { db } from '../db.js';

async function migrate() {
  await db.schema.createTable('catalog')
    .ifNotExists()
    .addColumn('id',              'serial',      c => c.primaryKey())
    .addColumn('name',            'text',        c => c.notNull())
    .addColumn('brand',           'text')
    .addColumn('category',        'text',        c => c.notNull())
    .addColumn('subcategory',     'text')
    .addColumn('color',           'text',        c => c.notNull())
    .addColumn('secondary_color', 'text')
    .addColumn('pattern',         'text')
    .addColumn('fabric',          'text')
    .addColumn('fit',             'text')
    .addColumn('formality',       'text')
    .addColumn('style',           'text')
    .addColumn('gender_style',    'text')
    .addColumn('season',          'text')
    .addColumn('style_vibes',     'text')
    .addColumn('occasion_tags',   'text')
    .addColumn('image_url',       'text',        c => c.notNull())
    .addColumn('created_at',      'timestamptz', c => c.defaultTo('now()'))
    .execute();

  console.log('✅ catalog table created');
  await db.destroy();
}

migrate().catch(e => { console.error(e); process.exit(1); });
