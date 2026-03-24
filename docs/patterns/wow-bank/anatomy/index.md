---
sidebar_position: 2
---

# Анатомия плашек

[Плашки нужны](../index.md#почему-нужны-плашки) для группировки и структурирования, визуальной передышки/воздуха, создания иерархии и акцентов. При разработке композиций с вложенными элементами критически важно проверять согласованность [внешних и внутренних радиусов](../rounding/).

## Desktop・1280-768рх, outer radius 32px

- Используем компонент [Container-box](https://www.figma.com/design/gkvm2ZhN87pJWZcD7OLkR0/07-%E2%9C%85-Tools--Carousels--Cards?node-id=33272-94884&t=VXBB2mcQoUQznVsA-1) type=shadow box.
- Вертикальные отступы между компонентами 24px.

![alt text](external-d.jpg)

Внутренние вертикальные отступы подбираются в зависимости от анатомии компонента, выноса ховера и т.д. (по границе верхнего атома в компоненте), но не менее 8рх.

Внутренние горизонтальные отступы:

- слева и справа 24px (контролы, инпуты, тексты и пр.),
- слева и справа не менее 8px (встроенные внутренние контейнеры, ховеры).

![alt text](internal-d-2.jpg)

## Adaptive・767-360рх, outer radius 24px

- Используем компонент [Container-box](https://www.figma.com/design/gkvm2ZhN87pJWZcD7OLkR0/07-%E2%9C%85-Tools--Carousels--Cards?node-id=33272-94884&t=VXBB2mcQoUQznVsA-1) type=shadow box.
- Вертикальные отступы между компонентами 16px.

![alt text](external-a.jpg)

Внутренние вертикальные отступы подбираются в зависимости от анатомии компонента (по границе верхнего атома в компоненте), но не менее 8рх.

Внутренние горизонтальные отступы:

- слева и справа 24px (контролы, инпуты, тексты и пр.),
- слева и справа не менее 8px (встроенные внутренние контейнеры).

![alt text](internal-a-2.jpg)

При использовании компонента [Promocard](https://www.figma.com/design/gkvm2ZhN87pJWZcD7OLkR0/07-%E2%9C%85-Tools--Carousels--Cards?node-id=49889-152348&t=FnxYxVzrD1iBLjL9-1), который стилистически повторяет плашку, слева и справа до краев экрана используются марджины 24рх. В данном случае карточка выполняет функцию вложенного элемента на странице, но равного по массе — условного оффера и предложения, а не выполняет функцию островка или подложки для групп элементов, как [Container-box shadow](https://www.figma.com/design/gID5xdjlCmAQvvRSfTZKbz/%D0%9F%D1%80%D0%BE%D0%BC%D0%BE%D0%BA%D0%BE%D0%B4%D1%8B?node-id=3128-39004&t=5eKXHBevOXI8BONM-1).

![alt text](internal-a-3.jpg)

## Mobile, outer radius 24px

- Используем компонент [Container-box-shadow](https://www.figma.com/design/gkvm2ZhN87pJWZcD7OLkR0/07-%E2%9C%85-Tools--Carousels--Cards?node-id=44484-270236&t=mWKn9abjVeRTeDeM-1).
- Вертикальные отступы между компонентами 16px.

![alt text](external-m.jpg)

Внутренние вертикальные отступы от 0px до 32px.

Внутренние горизонтальные отступы от 0px до 24рх.

![alt text](internal-m-2.jpg)

При использовании компонента [Control List Forward](https://www.google.com/url?q=https://www.figma.com/design/G4Y5zzmntFmcu9DQ0XbyGa/06-%25E2%259C%2585-Table-Controls?node-id%3D30505-27707%26t%3D57KhVj1NqNZO8hPe-1&sa=D&source=docs&ust=1774343220687304&usg=AOvVaw3W75l6VMMLXbwt_R6jXZbC) с подложкой, который стилистически повторяет плашку, допускается использование на всю ширину экрана или с марджинами 24 px.

Для разных случаев:

1. Когда карточка выполняет функцию вложенного элемента на странице, но равного по массе — условного оффера и предложения — используем марджин 24рх.
2. Когда карточка выполняет функцию основного контента, аналогичную [Container-box-shadow](https://www.google.com/url?q=https://www.figma.com/design/gkvm2ZhN87pJWZcD7OLkR0/07-%25E2%259C%2585-Tools--Carousels--Cards?node-id%3D44484-270236%26t%3DVyZ5jrGqPhAxW686-1&sa=D&source=docs&ust=1774343220687363&usg=AOvVaw2QME0VJerU3YqdALBdb5hn) — используем во всю ширину.

![alt text](internal-m-3.jpg)
