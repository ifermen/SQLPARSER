-- US-01 · Criterio 5: tabla intermedia con atributos propios
-- (MySQL, estilo exportación de phpMyAdmin: restricciones en ALTER TABLE)
CREATE TABLE `author` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE `book` (
  `id` int(11) NOT NULL,
  `title` varchar(200) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE `book_author` (
  `book_id` int(11) NOT NULL,
  `author_id` int(11) NOT NULL,
  `author_order` tinyint(4) NOT NULL DEFAULT 1,
  `royalty_pct` decimal(5,2) DEFAULT NULL
) ENGINE=InnoDB;

ALTER TABLE `author`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `book`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `book_author`
  ADD PRIMARY KEY (`book_id`,`author_id`),
  ADD KEY `author_id` (`author_id`);

ALTER TABLE `author`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `book`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

ALTER TABLE `book_author`
  ADD CONSTRAINT `fk_ba_book` FOREIGN KEY (`book_id`) REFERENCES `book` (`id`),
  ADD CONSTRAINT `fk_ba_author` FOREIGN KEY (`author_id`) REFERENCES `author` (`id`);
