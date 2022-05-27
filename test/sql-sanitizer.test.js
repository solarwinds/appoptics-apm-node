/* global it, describe */
'use strict'
const expect = require('chai').expect
const sqlSanitizer = require('../lib/sql-sanitizer')

describe('sqlSanitizer basic', function () {
  it('should sanitizes an insert list', function () {
    const sql = "INSERT INTO `queries` (`asdf_id`, `asdf_prices`, `created_at`, `updated_at`, `blue_pill`, `yearly_tax`, `rate`, `steam_id`, `red_pill`, `dimitri`, `origin`) VALUES (19231, 3, 'cat', 'dog', 111.0, 126.0, 116.0, 79.0, 72.0, 73.0, ?, 1, 3, 229.284, ?, ?, 100, ?, 0, 3, 1, ?, NULL, NULL, ?, 4, ?)"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('INSERT INTO `queries` (`asdf_id`, `asdf_prices`, `created_at`, `updated_at`, `blue_pill`, `yearly_tax`, `rate`, `steam_id`, `red_pill`, `dimitri`, `origin`) VALUES (?, ?, ?, ?, ?.?, ?.?, ?.?, ?.?, ?.?, ?.?, ?, ?, ?, ?.?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)')
  })

  it('should sanitizes a in list', function () {
    const sql = 'SELECT "game_types".* FROM "game_types" WHERE "game_types"."game_id" IN (1162)'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT "game_types".* FROM "game_types" WHERE "game_types"."game_id" IN (?)')
  })

  it('should sanitizes args in string', function () {
    const sql = "SELECT \"comments\".* FROM \"comments\" WHERE \"comments\".\"commentable_id\" = 2798 AND \"comments\".\"commentable_type\" = 'Video' AND \"comments\".\"parent_id\" IS NULL ORDER BY comments.created_at DESC"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT "comments".* FROM "comments" WHERE "comments"."commentable_id" = ? AND "comments"."commentable_type" = ? AND "comments"."parent_id" IS NULL ORDER BY comments.created_at DESC')
  })

  it('should sanitizes a mixture of situations', function () {
    const sql = "SELECT `assets`.* FROM `assets` WHERE `assets`.`type` IN ('Picture') AND (updated_at >= '2015-07-08 19:22:00') AND (updated_at <= '2015-07-08 19:23:00') LIMIT 31 OFFSET ?"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT `assets`.* FROM `assets` WHERE `assets`.`type` IN (?) AND (updated_at >= ?) AND (updated_at <= ?) LIMIT ? OFFSET ?')
  })

  it('should sanitizes quoted stuff', function () {
    const sql = "SELECT `users`.* FROM `users` WHERE (mobile IN ('234 234 234') AND email IN ('a_b_c@hotmail.co.uk'))"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT `users`.* FROM `users` WHERE (mobile IN (?) AND email IN (?))')
  })

  it('should sanitizes complicated quoted stuff', function () {
    const sql = "SELECT `users`.* FROM `users` WHERE (mobile IN ('2342423') AND email IN ('a_b_c@hotmail.co.uk')) LIMIT 5"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT `users`.* FROM `users` WHERE (mobile IN (?) AND email IN (?)) LIMIT ?')
  })

  it('should adapt to = spacing', function () {
    const sql = "UPDATE my_table SET col1=10, col2=20, col3=30 WHERE col1=1"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('UPDATE my_table SET col1=?, col2=?, col3=? WHERE col1=?')
  })

  it('should adapt to , spacing', function () {
    const sql = "INSERT INTO `queries` (`asdf_id`, `asdf_prices`, `created_at`, `updated_at`, `blue_pill`, `yearly_tax`, `rate`, `steam_id`, `red_pill`, `dimitri`, `origin`) VALUES (19231,3,'cat','dog', 111.0, 126.0, 116.0, 79.0, 72.0, 73.0, ?, 1, 3, 229.284, ?, ?, 100, ?, 0, 3, 1, ?, NULL,NULL, ?, 4, ?)"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('INSERT INTO `queries` (`asdf_id`, `asdf_prices`, `created_at`, `updated_at`, `blue_pill`, `yearly_tax`, `rate`, `steam_id`, `red_pill`, `dimitri`, `origin`) VALUES (?,?,?,?, ?.?, ?.?, ?.?, ?.?, ?.?, ?.?, ?, ?, ?, ?.?, ?, ?, ?, ?, ?, ?, ?, ?, NULL,NULL, ?, ?, ?)')
  })

  it('should not remove numbers from column names', function () {
    const sql = 'UPDATE my_table SET col1 = 10, col2 = 20, col3 = 30 WHERE col1 = 1'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('UPDATE my_table SET col1 = ?, col2 = ?, col3 = ? WHERE col1 = ?')
  })

  it('should handle multi line SQL', function () {
    const sql = `
      SELECT
        First_Name,
        Nickname
      FROM
        Friends
      WHERE
        Nickname LIKE '%brain%';
      `
    const result = sqlSanitizer.sanitize(sql)
    const expected = `
      SELECT
        First_Name,
        Nickname
      FROM
        Friends
      WHERE
        Nickname LIKE ?;
      `
    expect(result).equal(expected)
  })
})

/* eslint-disable no-useless-escape */
describe('sqlSanitizer multi single quote', function () {
  it('should properly handle \'', function () {
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake's' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle double \'', function () {
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake''s' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle triple \'', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake'''s' GROUP BY tbl1.name is NOT valid SQL
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake'''s' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle quadrupedal \'', function () {
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake''''s' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle \' with following space', function () {
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake' s' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle \' with preceding space', function () {
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake 's' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle \' with surrounding space', function () {
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake ' s' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle quadrupedal \' with space', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake'' ''s' GROUP BY tbl1.name is valid SQL
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake'' ''s' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle double double \'', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = 'can sanitize this''can sanitize this' GROUP BY tbl1.name" in NOT valid SQL
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'can sanitize this''can sanitize this' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ?? GROUP BY tbl1.name')
  })

  it('should properly handle \' after quoted value', function () {
    const sql = "SELECT 'jack' FROM test_table tbl1 WHERE tbl1.name = 'jake's' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT ? FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle \' in and after quoted value', function () {
    const sql = "SELECT 'jack's' FROM test_table tbl1 WHERE tbl1.name = 'jake's' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT ? FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })
})

describe('sqlSanitizer multi single quote (escape notation)', function () {
  it('should properly handle escaped \'', function () {
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake\'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle double escaped \'', function () {
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake\'\'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle triple escaped \'', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake'''s' GROUP BY tbl1.name is NOT valid SQL
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake\'\'\'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle quadrupedal escaped \'', function () {
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake\'\'\'\'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle escaped \' with following space', function () {
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake\' s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle escaped \' with preceding space', function () {
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake \'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle escaped \' with surrounding space', function () {
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake \' s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle quadrupedal escaped \' with space', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = 'jake'' ''s' GROUP BY tbl1.name is valid SQL
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'jake\'\' \'\'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle escape double double \'', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = 'can sanitize this''can sanitize this' GROUP BY tbl1.name" in NOT valid SQL
    const sql = 'SELECT * FROM test_table tbl1 WHERE tbl1.name = \'can sanitize this\'\'can sanitize this\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ?? GROUP BY tbl1.name')
  })

  it('should properly handle escaped \' after quoted value', function () {
    const sql = 'SELECT \'jack\' FROM test_table tbl1 WHERE tbl1.name = \'jake\'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT ? FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle escaped \' in and after quoted value', function () {
    const sql = 'SELECT \'jack\'s\' FROM test_table tbl1 WHERE tbl1.name = \'jake\'s\' GROUP BY tbl1.name'
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT ? FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })
})

describe('sqlSanitizer cleanup of dangle \'', function () {
  it('should properly handle triple \' with space (\'can sanitize this\'\')', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = 'can sanitize this'' GROUP BY tbl1.name is NOT valid SQL
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = 'can sanitize this'' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })

  it('should properly handle triple \' with space (\'\'can sanitize this\')', function () {
    // note: SELECT * FROM test_table tbl1 WHERE tbl1.name = ''can sanitize this' GROUP BY tbl1.name is NOT valid SQL
    const sql = "SELECT * FROM test_table tbl1 WHERE tbl1.name = ''can sanitize this' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT * FROM test_table tbl1 WHERE tbl1.name = ? GROUP BY tbl1.name')
  })
})

describe('sqlSanitizer aggressive cleanup when \' involved', function () {
  it('should remove more rather than less', function () {
    // note: SELECT P.FirstName FROM \"[ Int'l Sales]\" P WHERE P.FirstName =  'Jake' is NOT valid SQL
    // the sanitizer "sees" most statement inside single ' and aggressively trims
    const sql = "SELECT P.FirstName FROM \"[ Int'l Sales]\" P WHERE P.FirstName =  'Jake'"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT P.FirstName FROM "[ Int?')
  })

  it('should properly handle triple \' with space (\'\'can sanitize this\') after same', function () {
    // note: SELECT ''can sanitize this' FROM test_table tbl1 WHERE tbl1.name = ''can sanitize this' GROUP BY tbl1.name is NOT valid SQL
    // the sanitizer "sees"  many groups and aggressively trims
    const sql = "SELECT ''can sanitize this' FROM test_table tbl1 WHERE tbl1.name = ''can sanitize this' GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT ? GROUP BY tbl1.name')
  })

  it('should properly mishmash of \' endint clean', function () {
    // note: SELECT 'normal' 'jake's' 'this is tow'' this is three ''' WHERE 'abc'de GROUP BY tbl1.name is NOT valid SQL
    // the sanitizer "sees"  many groups and aggressively trims
    const sql = "SELECT 'normal' 'jake's' 'this is tow'' this is three ''' WHERE 'abc'de GROUP BY tbl1.name"
    const result = sqlSanitizer.sanitize(sql)
    expect(result).equal('SELECT ?? WHERE ? GROUP BY tbl1.name')
  })

  it('should properly mishmash of \' ending in mishmash', function () {
    // note: SELECT 'normal' 'jake's' 'this is tow'' this is three ''' WHERE 'abc'de GROUP BY 'wait'what'sthat' is NOT valid SQL
    const sql = "SELECT 'normal' 'jake's' 'this is tow'' this is three ''' WHERE 'abc'de GROUP BY 'wait'what'sthat'"
    const result = sqlSanitizer.sanitize(sql)
    console.log(result)
    expect(result).equal('SELECT ?')
  })
})
