package com.example.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * Clave primaria compuesta de {@link BookAuthor} (se usa con {@code @IdClass}).
 */
public class BookAuthorId implements Serializable {

    private static final long serialVersionUID = 1L;

    private Integer bookId;

    private Integer authorId;

    public BookAuthorId() {
    }

    public BookAuthorId(Integer bookId, Integer authorId) {
        this.bookId = bookId;
        this.authorId = authorId;
    }

    public Integer getBookId() {
        return bookId;
    }

    public void setBookId(Integer bookId) {
        this.bookId = bookId;
    }

    public Integer getAuthorId() {
        return authorId;
    }

    public void setAuthorId(Integer authorId) {
        this.authorId = authorId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof BookAuthorId)) {
            return false;
        }
        BookAuthorId that = (BookAuthorId) other;
        return Objects.equals(bookId, that.bookId)
                && Objects.equals(authorId, that.authorId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(bookId, authorId);
    }
}
