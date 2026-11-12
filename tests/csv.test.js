import { describe, expect, it } from 'vitest'
import { parseCSV, parseMenuCSV, parsePrice, parseAvailable, MENU_TEMPLATE } from '../src/lib/csv.js'

describe('parseCSV', () => {
  it('lee punto y coma (Excel en español) y comillas', () => {
    expect(parseCSV('a;b\r\n"x;y";"di ""hola"""\r\n')).toEqual([
      ['a', 'b'],
      ['x;y', 'di "hola"'],
    ])
  })

  it('lee coma y descarta filas vacías', () => {
    expect(parseCSV('a,b\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('parsePrice (RN-A4: pesos enteros)', () => {
  it.each([
    ['3500', 3500],
    ['3.500', 3500],
    ['$ 14.000', 14000],
    ['1,200', 1200],
  ])('%s → %i', (raw, value) => {
    expect(parsePrice(raw)).toEqual({ value })
  })

  it.each(['3500,50', '2000.5', '', 'gratis', '0', '-200'])('rechaza %s', (raw) => {
    expect(parsePrice(raw).error).toBeTruthy()
  })
})

describe('parseAvailable', () => {
  it('entiende Sí/No con o sin tilde', () => {
    expect(parseAvailable('Sí').value).toBe(true)
    expect(parseAvailable('no').value).toBe(false)
    expect(parseAvailable('Agotado').value).toBe(false)
    expect(parseAvailable('').value).toBe(true)
    expect(parseAvailable('quizás').error).toBeTruthy()
  })
})

describe('parseMenuCSV (CAF-12)', () => {
  it('carga la plantilla de la guía sin errores', () => {
    const { rows, errors } = parseMenuCSV(MENU_TEMPLATE)
    expect(errors).toEqual([])
    expect(rows).toHaveLength(6)
    expect(rows.find((r) => r.name === 'Pandebono')).toEqual({
      name: 'Pandebono',
      category: 'Panadería',
      price: 2500,
      available: false,
    })
  })

  it('acepta categorías sin tilde y encabezados en otro orden', () => {
    const { rows, errors } = parseMenuCSV('precio;nombre;categoria\n2000;Tinto;bebidas calientes')
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ name: 'Tinto', category: 'Bebidas calientes', price: 2000, available: true })
  })

  it('informa cada fila inválida con su número', () => {
    const { rows, errors } = parseMenuCSV('Nombre;Categoría;Precio\nTinto;Bebidas;2000\nX;Panadería;2500,5\nTinto;Panadería;100')
    expect(rows).toEqual([{ name: 'Tinto', category: 'Panadería', price: 100, available: true }])
    expect(errors[0]).toMatch(/^Fila 2 .*categoría/)
    expect(errors[1]).toMatch(/^Fila 3 .*nombre.*centavos/)
    expect(errors).toHaveLength(2)
  })

  it('detecta productos repetidos en el archivo', () => {
    const { errors } = parseMenuCSV('Nombre;Categoría;Precio\nTinto;Bebidas calientes;2000\ntinto;Bebidas calientes;2100')
    expect(errors[0]).toMatch(/repetido/)
  })

  it('exige las columnas obligatorias', () => {
    expect(parseMenuCSV('Nombre;Precio\nTinto;2000').errors[0]).toMatch(/Faltan columnas/)
  })
})
